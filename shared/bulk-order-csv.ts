export const BULK_ORDER_CSV_MAX_ROWS = 5000;

export interface BulkOrderCsvItem {
  rowNumber: number;
  cells: string[];
  sku: string;
  quantity: number;
  notes: string;
}

export interface ParsedBulkOrderCsv {
  headers: string[];
  items: BulkOrderCsvItem[];
  skuColumn: number;
  quantityColumn: number;
  availabilityColumn: number;
  customerName?: string;
  customerEmail?: string;
}

export interface MissingBulkOrderCsvItem {
  item: BulkOrderCsvItem;
  missingQuantity: number;
  stockAvailable: number;
}

export function customerNameFromOrderFormFileName(fileName: string): string {
  const baseName = String(fileName ?? "")
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]*$/, "") ?? "";
  return baseName
    .replace(/(?:[-_\s]+order[-_\s]+form)(?:[-_\s]+\d+(?:[-_\s]+\d+)*)?$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsvRows(input: string): string[][] {
  const source = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i++) {
    const character = source[i];

    if (inQuotes) {
      if (character === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some(value => value.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += character;
    }
  }

  if (inQuotes) throw new Error("The CSV contains an unterminated quoted field.");
  row.push(cell);
  if (row.some(value => value.trim() !== "")) rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function optionalColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  return normalized.findIndex(header => aliases.includes(header));
}

function uniqueNonEmptyValues(rows: string[][], column: number, label: string): string | undefined {
  if (column < 0) return undefined;
  const values = [...new Set(rows.map(row => row[column]?.trim()).filter((value): value is string => Boolean(value)))];
  if (values.length > 1) throw new Error(`The CSV has more than one ${label}.`);
  return values[0];
}

export function parseBulkOrderCsv(
  input: string,
  options: { allowEmptyItems?: boolean } = {},
): ParsedBulkOrderCsv {
  if (BufferlessByteLength(input) > 4 * 1024 * 1024) {
    throw new Error("CSV files must be 4 MB or smaller.");
  }

  const rows = parseCsvRows(input);
  if (!rows.length || (rows.length < 2 && !options.allowEmptyItems)) {
    throw new Error("The order form needs a header and at least one completed item.");
  }

  const headers = rows[0].map(value => value.trim());
  const skuColumn = optionalColumn(headers, ["sku", "productsku"]);
  const quantityColumn = optionalColumn(headers, ["qty", "quantity", "orderqty", "orderquantity"]);
  const availabilityColumn = optionalColumn(headers, ["availability", "stockstatus"]);
  const notesColumn = optionalColumn(headers, ["notes", "note"]);
  const customerNameColumn = optionalColumn(headers, ["customername", "name"]);
  const customerEmailColumn = optionalColumn(headers, ["customeremail", "email"]);

  if (skuColumn < 0) throw new Error('The CSV must include a "SKU" column.');
  if (quantityColumn < 0) throw new Error('The CSV must include a "Qty" or "Quantity" column.');
  if (headers.length > 100) throw new Error("The CSV has too many columns.");

  const dataRows = rows.slice(1);
  if (dataRows.length > BULK_ORDER_CSV_MAX_ROWS) {
    throw new Error(`The CSV can contain at most ${BULK_ORDER_CSV_MAX_ROWS} item rows.`);
  }

  const items: BulkOrderCsvItem[] = [];
  for (let index = 0; index < dataRows.length; index++) {
    const cells = dataRows[index];
    const sku = cells[skuColumn]?.trim() ?? "";
    const quantityText = cells[quantityColumn]?.trim() ?? "";
    if (!sku && !quantityText) continue;
    if (!sku) throw new Error(`Row ${index + 2} has a quantity but no SKU.`);
    if (sku.length > 100) throw new Error(`Row ${index + 2} has an SKU longer than 100 characters.`);
    if (!quantityText) continue;

    const quantity = Number(quantityText);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) {
      throw new Error(`Row ${index + 2} must have a whole-number quantity from 1 to 10,000.`);
    }
    items.push({
      rowNumber: index + 2,
      cells,
      sku,
      quantity,
      notes: notesColumn < 0 ? "" : (cells[notesColumn] ?? "").trim(),
    });
  }

  if (!items.length && !options.allowEmptyItems) {
    throw new Error("No completed order quantities were found in the order form.");
  }

  return {
    headers,
    items,
    skuColumn,
    quantityColumn,
    availabilityColumn,
    customerName: uniqueNonEmptyValues(dataRows, customerNameColumn, "customer name"),
    customerEmail: uniqueNonEmptyValues(dataRows, customerEmailColumn, "customer email"),
  };
}

function BufferlessByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function escapeCsvCell(value: string): string {
  let safeValue = value;
  if (/^[\s]*[=+\-@]/.test(safeValue)) safeValue = `'${safeValue}`;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export function buildMissingBulkOrderCsv(
  parsed: ParsedBulkOrderCsv,
  missingItems: MissingBulkOrderCsvItem[],
): string {
  const records = missingItems.map(({ item, missingQuantity, stockAvailable }) => {
    const cells = [...item.cells];
    while (cells.length < parsed.headers.length) cells.push("");
    cells[parsed.quantityColumn] = String(missingQuantity);
    if (parsed.availabilityColumn >= 0) {
      cells[parsed.availabilityColumn] = stockAvailable > 0 ? "Available" : "OOS";
    }
    return cells.slice(0, parsed.headers.length);
  });

  return [parsed.headers, ...records]
    .map(row => row.map(cell => escapeCsvCell(String(cell ?? ""))).join(","))
    .join("\r\n");
}