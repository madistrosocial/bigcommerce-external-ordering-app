export interface MarketingProductSnapshot {
  id: number;
  bigcommerce_id: number;
  name: string;
  sku: string;
  price: string;
  image: string;
  stock_level: number;
  product_url: string;
}

export interface MarketingProductDisplayOptions {
  showProductImages: boolean;
  showProductTitles: boolean;
  showProductPrices: boolean;
  showShopNowButton: boolean;
}

export const DEFAULT_MARKETING_PRODUCT_DISPLAY_OPTIONS: MarketingProductDisplayOptions = {
  showProductImages: true,
  showProductTitles: true,
  showProductPrices: false,
  showShopNowButton: true,
};

export function normalizeMarketingProductDisplayOptions(
  value: unknown,
): MarketingProductDisplayOptions {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    showProductImages: input.showProductImages !== false,
    showProductTitles: input.showProductTitles !== false,
    showProductPrices: input.showProductPrices === true,
    showShopNowButton: input.showShopNowButton !== false,
  };
}

export function escapeMarketingHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeProductUrl(value: unknown): string {
  const url = String(value ?? "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

function productMarkup(
  product: MarketingProductSnapshot,
  options: MarketingProductDisplayOptions,
): string {
  const title = escapeMarketingHtml(product.name);
  const url = safeProductUrl(product.product_url);
  const href = escapeMarketingHtml(url || "#");
  const image = options.showProductImages && product.image
    ? `<tr><td align="center" style="padding:0 0 14px"><a href="${href}" style="text-decoration:none"><img src="${escapeMarketingHtml(product.image)}" alt="${title}" width="220" style="display:block;width:100%;max-width:220px;height:auto;border:0"></a></td></tr>`
    : "";
  const titleRow = options.showProductTitles
    ? `<tr><td align="center" style="padding:0 8px 8px;font:600 16px Arial,Helvetica,sans-serif;line-height:22px;color:#1e293b"><a href="${href}" style="color:#1e293b;text-decoration:none">${title}</a></td></tr>`
    : "";
  const priceRow = options.showProductPrices
    ? `<tr><td align="center" style="padding:0 8px 12px;font:14px Arial,Helvetica,sans-serif;color:#475569">${escapeMarketingHtml(product.price ? `$${Number(product.price).toFixed(2)}` : "Price unavailable")}</td></tr>`
    : "";
  const buttonRow = options.showShopNowButton
    ? `<tr><td align="center" style="padding:0 8px 8px"><a href="${href}" style="display:inline-block;background:#2563eb;border-radius:5px;color:#ffffff;font:600 13px Arial,Helvetica,sans-serif;padding:10px 18px;text-decoration:none">Shop Now</a></td></tr>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border:1px solid #e2e8f0;background:#ffffff"><tbody>${image}${titleRow}${priceRow}${buttonRow}</tbody></table>`;
}

export function renderMarketingProductBlock(
  product: MarketingProductSnapshot,
  options: MarketingProductDisplayOptions,
): string {
  return `<!-- marketing-product-block:${product.id} -->${productMarkup(product, normalizeMarketingProductDisplayOptions(options))}<!-- /marketing-product-block:${product.id} -->`;
}

export function renderMarketingProductGrid(
  products: MarketingProductSnapshot[],
  options: MarketingProductDisplayOptions,
): string {
  const normalized = normalizeMarketingProductDisplayOptions(options);
  const cells = products.map(product =>
    `<td valign="top" width="${Math.floor(100 / Math.max(products.length, 1))}%" style="padding:6px">${productMarkup(product, normalized)}</td>`,
  ).join("");
  return `<!-- marketing-product-grid --><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:18px 0"><tbody><tr>${cells}</tr></tbody></table><!-- /marketing-product-grid -->`;
}