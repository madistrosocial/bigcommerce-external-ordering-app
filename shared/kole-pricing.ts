function positiveNumber(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(String(value).trim().replace(/[$,]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function getKoleExtendedCost(rawData: unknown, fallbackCost?: unknown): number | null {
  const raw = rawData && typeof rawData === "object" && !Array.isArray(rawData)
    ? rawData as Record<string, unknown>
    : {};

  if (Object.prototype.hasOwnProperty.call(raw, "ext_price")) {
    return positiveNumber(raw.ext_price);
  }

  if (Object.prototype.hasOwnProperty.call(raw, "item_piece_price")) {
    const piecePrice = positiveNumber(raw.item_piece_price);
    const minimumQuantity = positiveNumber(raw.minimum_qty);
    if (piecePrice === null || minimumQuantity === null) return null;
    const extendedCost = piecePrice * minimumQuantity;
    return Number.isFinite(extendedCost) && extendedCost > 0
      ? Math.round((extendedCost + Number.EPSILON) * 10000) / 10000
      : null;
  }

  return positiveNumber(fallbackCost);
}