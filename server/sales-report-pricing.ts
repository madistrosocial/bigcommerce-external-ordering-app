export type OrderLinePriceSource = "base_price" | "price_ex_tax" | "missing";

export interface BigCommerceOrderLinePrice {
  amount: string;
  source: OrderLinePriceSource;
}

/**
 * Resolve the price recorded for a specific BigCommerce order line.
 *
 * Nullish coalescing is intentional here: numeric and string zero are valid
 * checkout prices and must never fall through to a catalog-price fallback.
 */
export function resolveBigCommerceOrderLinePrice(item: {
  base_price?: unknown;
  price_ex_tax?: unknown;
}): BigCommerceOrderLinePrice {
  const hasBasePrice = item.base_price !== null && item.base_price !== undefined && item.base_price !== "";
  const rawPrice = hasBasePrice ? item.base_price : item.price_ex_tax;
  const source: OrderLinePriceSource = hasBasePrice ? "base_price" : (
    rawPrice !== null && rawPrice !== undefined && rawPrice !== "" ? "price_ex_tax" : "missing"
  );

  if (source === "missing") return { amount: "0", source };

  const amount = String(rawPrice).trim();
  if (!amount || !Number.isFinite(Number(amount))) {
    return { amount: "0", source: "missing" };
  }

  return { amount, source };
}

export function calculateSaleAmount(lines: Array<{ quantity: number; base_price: string | number | null | undefined }>): number {
  return lines.reduce((total, line) => {
    if (line.base_price === null || line.base_price === undefined) return total;
    return total + line.quantity * Number(line.base_price);
  }, 0);
}