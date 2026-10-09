import { StringDecoder } from "node:string_decoder";
import type { KoleProduct } from "./kole-imports";
import { getKoleExtendedCost } from "@shared/kole-pricing";

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

  if (quoted) throw new Error("The vendor feed contains an unterminated quoted field.");
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

export class KoleCsvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KoleCsvValidationError";
  }
}

export class KoleCsvTooLargeError extends Error {
  constructor() {
    super("The Kole CSV is larger than the supported 50 MB limit.");
    this.name = "KoleCsvTooLargeError";
  }
}

type KoleFeedHeaders = {
  columns: string[];
  costColumn: string;
};

function parseKoleFeedHeaders(values: string[]): KoleFeedHeaders {
  const preview = values.join(",").slice(0, 2048);
  if (/^\s*</.test(preview) && /<html[\s>]/i.test(preview)) {
    throw new KoleCsvValidationError("The uploaded file is an HTML page, not a CSV feed.");
  }
  const columns = values.map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim(),
  );
  const columnSet = new Set(columns);
  for (const required of ["id", "title", "description", "inventory", "image_large"]) {
    if (!columnSet.has(required)) {
      throw new KoleCsvValidationError(`The vendor feed is missing the "${required}" column.`);
    }
  }
  const costColumn = columnSet.has("ext_price")
    ? "ext_price"
    : columnSet.has("item_piece_price")
      ? "item_piece_price"
      : null;
  if (!costColumn) {
    throw new KoleCsvValidationError('The vendor feed is missing the "ext_price" or "item_piece_price" cost column.');
  }
  return { columns, costColumn };
}

function parseKoleFeedProductRow(
  values: string[],
  headers: KoleFeedHeaders,
  rowNumber: number,
): KoleProduct {
  if (values.length !== headers.columns.length) {
    throw new KoleCsvValidationError(
      `Vendor feed row ${rowNumber} has ${values.length} columns; expected ${headers.columns.length}.`,
    );
  }
  const record: Record<string, string> = Object.create(null);
  for (let column = 0; column < headers.columns.length; column++) {
    record[headers.columns[column]] = values[column];
  }

  const sku = String(record.id ?? "").trim();
  if (!sku) throw new KoleCsvValidationError(`Vendor feed row ${rowNumber} is missing a product SKU.`);
  const images = [record.image_large, record.image2_large, record.image3_large]
    .map((url) => String(url ?? "").trim())
    .filter((url) => /^https:\/\//i.test(url));
  const rawInventory = String(record.inventory ?? "").trim();
  const extendedCost = getKoleExtendedCost(record);
  const itemWeight = String(record.item_weight ?? "").trim();

  return {
    sku,
    vendorProductId: String(record["Internal ID"] ?? "").trim() || null,
    title: String(record.title ?? "").trim() || sku,
    description: decodeHtmlEntities(String(record.description ?? "")),
    brand: String(record.brand ?? "").trim() || null,
    upc: String(record.upc ?? "").trim() || null,
    inventory: parseInventory(rawInventory),
    cost: extendedCost === null ? null : String(extendedCost),
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
  };
}

export function parseKoleFeedCsv(csv: string): KoleProduct[] {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) throw new KoleCsvValidationError("The vendor feed is empty or missing product rows.");
  const headers = parseKoleFeedHeaders(rows[0]);
  return rows.slice(1).map((values, index) => parseKoleFeedProductRow(values, headers, index + 2));
}

export async function streamKoleFeedCsv(
  source: AsyncIterable<Uint8Array>,
  onBatch: (products: KoleProduct[]) => Promise<void>,
  options: { batchSize?: number; maxBytes?: number } = {},
): Promise<{ productsProcessed: number }> {
  const batchSize = options.batchSize ?? 250;
  const maxBytes = options.maxBytes ?? MAX_KOLE_FEED_BYTES;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("Kole CSV batch size must be a positive integer.");
  }

  const decoder = new StringDecoder("utf8");
  const products: KoleProduct[] = [];
  let headers: KoleFeedHeaders | null = null;
  let row: string[] = [];
  let fieldParts: string[] = [];
  let fieldLength = 0;
  let quoted = false;
  let pendingQuote = false;
  let firstText = true;
  let rowsRead = 0;
  let productsProcessed = 0;
  let bytesRead = 0;

  const appendFieldText = (value: string) => {
    if (!value) return;
    fieldParts.push(value);
    fieldLength += value.length;
  };

  const finishField = () => {
    row.push(fieldParts.join(""));
    fieldParts = [];
    fieldLength = 0;
  };

  const finishRow = async () => {
    finishField();
    const values = row;
    row = [];
    if (!values.some((value) => value.length > 0)) return;
    rowsRead++;
    if (!headers) {
      headers = parseKoleFeedHeaders(values);
      return;
    }

    const product = parseKoleFeedProductRow(values, headers, rowsRead);
    products.push(product);
    productsProcessed++;
    if (products.length >= batchSize) {
      const batch = products.splice(0, products.length);
      await onBatch(batch);
    }
  };

  const consumeText = async (input: string) => {
    if (!input) return;
    let text = input;
    if (firstText) {
      firstText = false;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }

    let index = 0;
    let segmentStart = 0;
    if (pendingQuote) {
      pendingQuote = false;
      if (text[0] === '"') {
        appendFieldText('"');
        index = 1;
      } else {
        quoted = false;
      }
      segmentStart = index;
      if (index === text.length) return;
    }

    for (; index < text.length; index++) {
      const char = text[index];
      if (quoted) {
        if (char === '"') {
          appendFieldText(text.slice(segmentStart, index));
          if (index + 1 < text.length) {
            if (text[index + 1] === '"') {
              appendFieldText('"');
              index++;
            } else {
              quoted = false;
            }
            segmentStart = index + 1;
          } else {
            pendingQuote = true;
            segmentStart = index + 1;
          }
        }
        continue;
      }

      if (char === '"' && fieldLength === 0) {
        appendFieldText(text.slice(segmentStart, index));
        quoted = true;
        segmentStart = index + 1;
      } else if (char === ",") {
        appendFieldText(text.slice(segmentStart, index));
        finishField();
        segmentStart = index + 1;
      } else if (char === "\n" || char === "\r") {
        appendFieldText(text.slice(segmentStart, index));
        await finishRow();
        if (char === "\r" && text[index + 1] === "\n") index++;
        segmentStart = index + 1;
      }
    }
    appendFieldText(text.slice(segmentStart));
  };

  for await (const chunk of source) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytesRead += buffer.byteLength;
    if (bytesRead > maxBytes) throw new KoleCsvTooLargeError();
    await consumeText(decoder.write(buffer));
  }
  await consumeText(decoder.end());

  if (pendingQuote) {
    pendingQuote = false;
    quoted = false;
  }
  if (quoted) throw new KoleCsvValidationError("The vendor feed contains an unterminated quoted field.");
  if (fieldParts.length > 0 || row.length > 0) await finishRow();
  if (!headers || productsProcessed === 0) {
    throw new KoleCsvValidationError("The vendor feed is empty or missing product rows.");
  }
  if (products.length > 0) await onBatch(products.splice(0, products.length));

  return { productsProcessed };
}