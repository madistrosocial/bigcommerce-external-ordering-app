import assert from "node:assert/strict";
import {
  KoleCsvTooLargeError,
  KoleCsvValidationError,
  streamKoleFeedCsv,
} from "../server/vendors/kole-feed";

const headers = [
  "id",
  "title",
  "description",
  "inventory",
  "image_large",
  "ext_price",
  "brand",
  "upc",
  "category",
  "subcategory",
  "is_closeout",
  "item_weight",
  "modified",
  "Internal ID",
  "image2_large",
  "image3_large",
];

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function row(values: string[]): string {
  return values.map(csvCell).join(",");
}

async function* byteChunks(value: string, size: number): AsyncGenerator<Buffer> {
  const data = Buffer.from(value, "utf8");
  for (let offset = 0; offset < data.length; offset += size) {
    yield data.subarray(offset, offset + size);
  }
}

const csv = [
  headers.join(","),
  row([
    "SKU-1", "Widget, compact", 'He said "Go"', "4",
    "https://images.example/one.jpg", "12.50", "Café Brand", "00123",
    "Home", "Kitchen", "yes", "1.5", "2026-10-08", "ID-1", "", "",
  ]),
  row([
    "SKU-2", "Second item", "First line\nsecond line", "8",
    "", "3.25", "Café Brand", "00456",
    "Home", "Office", "no", "", "", "ID-2", "", "",
  ]),
  "",
].join("\r\n");

const imported: Array<{ sku: string; title: string; description: string; raw: Record<string, unknown> }> = [];
const result = await streamKoleFeedCsv(
  byteChunks(`\uFEFF${csv}`, 3),
  async (batch) => {
    imported.push(...batch);
  },
  { batchSize: 1 },
);

assert.equal(result.productsProcessed, 2);
assert.equal(imported[0].title, "Widget, compact");
assert.equal(imported[0].description, 'He said "Go"');
assert.equal(imported[0].raw.inventoryProvided, true);
assert.equal(imported[1].description, "First line\nsecond line");

const webResponse = new Response(csv);
assert.ok(webResponse.body);
const webStreamResult = await streamKoleFeedCsv(
  webResponse.body as unknown as AsyncIterable<Uint8Array>,
  async () => {},
);
assert.equal(webStreamResult.productsProcessed, 2);

await assert.rejects(
  () => streamKoleFeedCsv(byteChunks(csv, 5), async () => {}, { maxBytes: 10 }),
  KoleCsvTooLargeError,
);

const invalidCsv = [
  headers.join(","),
  row(["SKU-3", "Broken", "unterminated", "1", "", "1", "", "", "", "", "", "", "", "", "", ""]),
  'SKU-4,"open quote',
].join("\n");
await assert.rejects(
  () => streamKoleFeedCsv(byteChunks(invalidCsv, 7), async () => {}, { batchSize: 250 }),
  KoleCsvValidationError,
);

console.log("Kole CSV streaming parser checks passed.");
