export type BulkOrderBcFetch = (path: string) => Promise<any>;

export interface ResolvedBulkOrderSku {
  productId: number;
  variantId: number | null;
  variantOptionValues: any[];
  sku: string;
  name: string;
  image: string;
  stockLevel: number;
  basePrice: number;
}

function normalizeSku(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveBasePrice(product: any, variant: any | null): number {
  const variantSale = asNumber(variant?.sale_price);
  const productSale = asNumber(product?.sale_price);
  const variantPrice = asNumber(variant?.price);
  const productPrice = asNumber(product?.price);
  const price = variantSale && variantSale > 0
    ? variantSale
    : productSale && productSale > 0
      ? productSale
      : variantPrice ?? productPrice;
  if (price === null || price < 0) {
    throw new Error(`BigCommerce did not return a valid price for SKU "${variant?.sku || product?.sku || "unknown"}".`);
  }
  return price;
}

function mapResolvedSku(product: any, variant: any | null): ResolvedBulkOrderSku {
  const productId = Number(product?.id);
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    throw new Error("BigCommerce returned a product without a valid ID.");
  }

  const variantIdValue = variant ? Number(variant.id) : null;
  const variantId = variantIdValue && Number.isSafeInteger(variantIdValue) && variantIdValue > 0
    ? variantIdValue
    : null;
  const stock = asNumber(variant?.inventory_level ?? product?.inventory_level) ?? 0;
  return {
    productId,
    variantId,
    variantOptionValues: Array.isArray(variant?.option_values) ? variant.option_values : [],
    sku: String(variant?.sku || product?.sku || ""),
    name: String(product?.name || `Product #${productId}`),
    image: String(product?.primary_image?.url_standard || product?.image_url || ""),
    stockLevel: Math.max(0, Math.floor(stock)),
    basePrice: resolveBasePrice(product, variant),
  };
}

export function createBulkOrderSkuResolver(bcFetch: BulkOrderBcFetch) {
  const productCache = new Map<number, Promise<any>>();
  const getProduct = (productId: number) => {
    let pending = productCache.get(productId);
    if (!pending) {
      pending = bcFetch(`/v3/catalog/products/${productId}?include=primary_image,variants`)
        .then((response) => response?.data);
      productCache.set(productId, pending);
    }
    return pending;
  };

  return async (rawSku: string): Promise<ResolvedBulkOrderSku | null> => {
    const sku = normalizeSku(rawSku);
    const variantResponse = await bcFetch(
      `/v3/catalog/variants?sku=${encodeURIComponent(sku)}&limit=10`,
    );
    const variants = (variantResponse?.data ?? []).filter(
      (candidate: any) => normalizeSku(candidate.sku) === sku,
    );
    if (variants.length > 1) {
      throw new Error(`SKU "${sku}" matches more than one BigCommerce variant.`);
    }

    if (variants.length === 1) {
      const variant = variants[0];
      const productId = Number(variant.product_id);
      const product = await getProduct(productId);
      if (!product) throw new Error(`BigCommerce product for SKU "${sku}" could not be loaded.`);
      const fullVariant = (product.variants ?? []).find(
        (candidate: any) => Number(candidate.id) === Number(variant.id),
      ) ?? variant;
      return mapResolvedSku(product, fullVariant);
    }

    const productResponse = await bcFetch(
      `/v3/catalog/products?sku=${encodeURIComponent(sku)}&include=primary_image,variants&limit=10`,
    );
    const products = (productResponse?.data ?? []).filter(
      (candidate: any) => normalizeSku(candidate.sku) === sku,
    );
    if (products.length > 1) {
      throw new Error(`SKU "${sku}" matches more than one BigCommerce product.`);
    }
    if (!products.length) return null;

    const product = products[0];
    const matchingVariant = (product.variants ?? []).find(
      (candidate: any) => normalizeSku(candidate.sku) === sku,
    );
    return mapResolvedSku(product, matchingVariant ?? null);
  };
}

export async function fetchBulkOrderPriceListPrices(
  priceListId: number | null,
  variantIds: number[],
  bcFetch: BulkOrderBcFetch,
): Promise<Map<number, number>> {
  if (!priceListId || variantIds.length === 0) return new Map();

  const query = new URLSearchParams();
  query.set("variant_id:in", [...new Set(variantIds)].join(","));
  query.set("limit", "250");
  const response = await bcFetch(`/v3/pricelists/${priceListId}/records?${query.toString()}`);
  const prices = new Map<number, number>();
  for (const record of response?.data ?? []) {
    const variantId = Number(record.variant_id);
    const price = asNumber(record.calculated_price ?? record.price);
    if (Number.isSafeInteger(variantId) && variantId > 0 && price !== null && price >= 0) {
      prices.set(variantId, price);
    }
  }
  return prices;
}