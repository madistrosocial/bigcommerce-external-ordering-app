const DEFAULT_VENDOR_DISPLAY_NAME = "Vendor Catalog";

export function toPublicVendorName(value: unknown): string {
  const name = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return !name || /kole/i.test(name) ? DEFAULT_VENDOR_DISPLAY_NAME : name;
}

export function toPublicVendorMessage(value: unknown): string {
  return String(value ?? "")
    .replace(/(?:https?:\/\/)?(?:[\w-]+\.)*koleimports\.com[^\s]*/gi, "supplier feed")
    .replace(/\bkoleimports\b/gi, "supplier")
    .replace(/\bkole\s+imports\b/gi, "supplier")
    .replace(/\bkole\b/gi, "supplier");
}