import ExcelJS from "exceljs";
import {
  BULK_ORDER_CSV_MAX_ROWS,
  parseBulkOrderCsv,
  type ParsedBulkOrderCsv,
} from "@shared/bulk-order-csv";

export const BULK_ORDER_XLSX_MAX_BYTES = 4 * 1024 * 1024;

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return "";

  const objectValue = value as {
    formula?: unknown;
    result?: unknown;
    text?: unknown;
    richText?: Array<{ text?: unknown }>;
    hyperlink?: unknown;
  };
  if (Array.isArray(objectValue.richText)) {
    return objectValue.richText.map(part => String(part.text ?? "")).join("");
  }
  if (objectValue.result !== undefined) return cellText(objectValue.result);
  if (objectValue.formula !== undefined) return "";
  if (objectValue.text !== undefined) return String(objectValue.text);
  if (objectValue.hyperlink !== undefined) return String(objectValue.hyperlink);
  return "";
}

function worksheetCellText(sheet: ExcelJS.Worksheet, row: number, column: number): string {
  const cell = sheet.getCell(row, column);
  if (cell.isMerged && cell.master.address !== cell.address) return "";
  return cellText(cell.value);
}

function quoteCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function getTableHeader(sheet: ExcelJS.Worksheet): {
  rowNumber: number;
  firstColumn: number;
  lastColumn: number;
  headers: string[];
} | null {
  const maxRowsToScan = Math.min(sheet.rowCount, 100);
  const maxColumns = Math.min(sheet.columnCount, 100);

  for (let rowNumber = 1; rowNumber <= maxRowsToScan; rowNumber++) {
    const values = Array.from(
      { length: maxColumns },
      (_, index) => worksheetCellText(sheet, rowNumber, index + 1).trim(),
    );
    const normalized = values.map(normalizeLabel);
    const hasSku = normalized.some(value => ["sku", "productsku"].includes(value));
    const hasQuantity = normalized.some(value =>
      ["qty", "quantity", "orderqty", "orderquantity"].includes(value),
    );
    if (!hasSku || !hasQuantity) continue;

    const nonEmptyColumns = values
      .map((value, index) => value ? index + 1 : 0)
      .filter(Boolean);
    if (!nonEmptyColumns.length) continue;
    const firstColumn = nonEmptyColumns[0];
    const lastColumn = nonEmptyColumns[nonEmptyColumns.length - 1];
    const headers = values.slice(firstColumn - 1, lastColumn);
    if (headers.length > 100) {
      throw new Error("The workbook has too many columns.");
    }
    return { rowNumber, firstColumn, lastColumn, headers };
  }

  return null;
}

function extractLabeledValue(
  sheets: ExcelJS.Worksheet[],
  labels: string[],
): string | undefined {
  for (const sheet of sheets) {
    const maxRows = Math.min(sheet.rowCount, 100);
    const maxColumns = Math.min(sheet.columnCount, 100);
    for (let rowNumber = 1; rowNumber <= maxRows; rowNumber++) {
      for (let columnNumber = 1; columnNumber <= maxColumns; columnNumber++) {
        const label = normalizeLabel(worksheetCellText(sheet, rowNumber, columnNumber));
        if (!labels.includes(label)) continue;
        for (let valueColumn = columnNumber + 1; valueColumn <= maxColumns; valueColumn++) {
          const value = worksheetCellText(sheet, rowNumber, valueColumn).trim();
          if (value) return value;
        }
      }
    }
  }
  return undefined;
}

function extractEmail(sheets: ExcelJS.Worksheet[]): string | undefined {
  const candidate = extractLabeledValue(sheets, [
    "email",
    "customeremail",
    "phoneemail",
    "emailaddress",
  ]);
  return candidate && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)
    ? candidate
    : undefined;
}

export function decodeBulkOrderWorkbookBase64(value: unknown): Buffer {
  if (typeof value !== "string" || !value || value.length > Math.ceil(BULK_ORDER_XLSX_MAX_BYTES / 3) * 4 + 4) {
    throw new Error("XLSX workbooks must be non-empty and 4 MB or smaller.");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error("The XLSX workbook data is invalid.");
  }

  const buffer = Buffer.from(value, "base64");
  if (
    buffer.length === 0
    || buffer.length > BULK_ORDER_XLSX_MAX_BYTES
    || buffer.subarray(0, 2).toString("ascii") !== "PK"
    || buffer.toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, "")
  ) {
    throw new Error("Choose a valid XLSX workbook that is 4 MB or smaller.");
  }
  return buffer;
}

export async function parseBulkOrderWorkbook(
  buffer: Buffer,
  options: { allowEmptyItems?: boolean } = {},
): Promise<ParsedBulkOrderCsv> {
  if (buffer.length === 0 || buffer.length > BULK_ORDER_XLSX_MAX_BYTES) {
    throw new Error("XLSX workbooks must be non-empty and 4 MB or smaller.");
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error("Could not read this XLSX workbook.");
  }
  if (!workbook.worksheets.length) throw new Error("The XLSX workbook has no worksheets.");
  if (workbook.worksheets.length > 20) throw new Error("The workbook has too many worksheets.");

  let tableSheet: ExcelJS.Worksheet | undefined;
  let tableHeader: ReturnType<typeof getTableHeader> = null;
  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > BULK_ORDER_CSV_MAX_ROWS + 500) {
      throw new Error(`The workbook can contain at most ${BULK_ORDER_CSV_MAX_ROWS} item rows.`);
    }
    if (sheet.columnCount > 100) throw new Error("The workbook has too many columns.");
    const header = getTableHeader(sheet);
    if (header) {
      tableSheet = sheet;
      tableHeader = header;
      break;
    }
  }
  if (!tableSheet || !tableHeader) {
    throw new Error('The workbook must contain "SKU" and "Qty" columns in its item table.');
  }

  const tableRows: string[][] = [tableHeader.headers];
  for (let rowNumber = tableHeader.rowNumber + 1; rowNumber <= tableSheet.rowCount; rowNumber++) {
    const cells = Array.from(
      { length: tableHeader.lastColumn - tableHeader.firstColumn + 1 },
      (_, index) => worksheetCellText(tableSheet!, rowNumber, tableHeader!.firstColumn + index),
    );
    if (cells.some(value => value.trim() !== "")) tableRows.push(cells);
  }
  if (tableRows.length - 1 > BULK_ORDER_CSV_MAX_ROWS) {
    throw new Error(`The workbook can contain at most ${BULK_ORDER_CSV_MAX_ROWS} item rows.`);
  }

  const tableCsv = tableRows
    .map(row => row.map(quoteCsvCell).join(","))
    .join("\r\n");
  const parsed = parseBulkOrderCsv(tableCsv, options);
  const workbookCustomerName = extractLabeledValue(workbook.worksheets, [
    "customername",
    "customer",
  ]);
  const workbookCustomerEmail = extractEmail(workbook.worksheets);

  return {
    ...parsed,
    customerName: workbookCustomerName || parsed.customerName,
    customerEmail: workbookCustomerEmail || parsed.customerEmail,
  };
}