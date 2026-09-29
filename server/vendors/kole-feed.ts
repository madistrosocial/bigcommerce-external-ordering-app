import type { KoleProduct } from "./kole-imports";

export const KOLE_CSV_FEED_URL = "https://www.koleimports.com/dropship/feed/downloadfeed";
export const MAX_KOLE_FEED_BYTES = 50 * 1024 * 1024;

function parseCsvRows(csv: string): string[][] {
  const text = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("Kole Imports feed contains an unterminated quoted field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    const normalized = code.toLowerCase();
    if (normalized === "amp") return "&";
    if (normalized === "lt") return "<";
    if (normalized === "gt") return ">";
    if (normalized === "quot") return '"';
    if (normalized === "apos" || normalized === "#39") return "'";
    if (normalized === "nbsp") return " ";

    const numeric = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0x10ffff) return entity;
    try {
      return String.fromCodePoint(numeric);
    } catch {
      return entity;
    }
  });
}

function parseDate(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseInventory(value: string | undefined): number {
  if (!value?.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export function parseKoleFeedCsv(csv: string): KoleProduct[] {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) throw new Error("Kole Imports feed is empty or missing product rows.");

  const headers = rows[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim());
  const headerSet = new Set(headers);
  for (const required of ["id", "title", "description", "inventory", "image_large"]) {
    if (!headerSet.has(required)) throw new Error(`Kole Imports feed is missing the "${required}" column.`);
  }
  const costColumn = headerSet.has("ext_price")
    ? "ext_price"
    : headerSet.has("item_piece_price")
      ? "item_piece_price"
      : null;
  if (!costColumn) throw new Error('Kole Imports feed is missing the "ext_price" or "item_piece_price" cost column.');

  const products: KoleProduct[] = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const values = rows[rowIndex];
    if (values.length !== headers.length) {
      throw new Error(`Kole Imports feed row ${rowIndex + 1} has ${values.length} columns; expected ${headers.length}.`);
    }
    const record: Record<string, string> = {};
    for (let column = 0; column < headers.length; column++) record[headers[column]] = values[column];

    const sku = String(record.id ?? "").trim();
    if (!sku) throw new Error(`Kole Imports feed row ${rowIndex + 1} is missing a product SKU.`);
    const images = [record.image_large, record.image2_large, record.image3_large]
      .map((url) => String(url ?? "").trim())
      .filter((url) => /^https:\/\//i.test(url));
    const rawInventory = String(record.inventory ?? "").trim();
    const cost = String(record[costColumn] ?? "").trim();
    const itemWeight = String(record.item_weight ?? "").trim();

    products.push({
      sku,
      vendorProductId: String(record["Internal ID"] ?? "").trim() || null,
      title: String(record.title ?? "").trim() || sku,
      description: decodeHtmlEntities(String(record.description ?? "")),
      brand: String(record.brand ?? "").trim() || null,
      upc: String(record.upc ?? "").trim() || null,
      inventory: parseInventory(rawInventory),
      cost: cost && Number.isFinite(Number(cost)) ? cost : null,
      tierData: [],
      imageData: images,
      category: String(record.category ?? "").trim() || null,
      subcategory: String(record.subcategory ?? "").trim() || null,
      closeout: ["yes", "true", "1", "y"].includes(String(record.is_closeout ?? "").trim().toLowerCase()),
      weight: itemWeight && Number.isFinite(Number(itemWeight)) ? itemWeight : null,
      modifiedAt: parseDate(record.modified),
      raw: {
        ...record,
        inventoryProvided: rawInventory !== "",
      },
    });
  }

  return products;
}