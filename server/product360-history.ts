import { db } from "../db";
import { sql } from "drizzle-orm";

export type Product360HistoryEntry = {
  productId: number;
  bigcommerceId: number;
  variantId?: number | null;
  variantLabel?: string | null;
  fieldKey: string;
  fieldLabel: string;
  oldValue: unknown;
  newValue: unknown;
  userId: number;
  userName: string;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value ?? null;
}

export function product360HistoryValuesEqual(fieldKey: string, oldValue: unknown, newValue: unknown) {
  const numericFields = new Set([
    "brand_id", "sort_order", "price", "cost_price", "retail_price", "sale_price",
    "weight", "width", "height", "depth", "inventory_level",
  ]);
  if (numericFields.has(fieldKey)) {
    if (oldValue == null || oldValue === "") return newValue == null || newValue === "";
    if (newValue == null || newValue === "") return false;
    const oldNumber = Number(oldValue);
    const newNumber = Number(newValue);
    if (Number.isFinite(oldNumber) && Number.isFinite(newNumber)) return oldNumber === newNumber;
  }
  if (fieldKey === "categories" && Array.isArray(oldValue) && Array.isArray(newValue)) {
    const oldIds = oldValue.map(Number).sort((a, b) => a - b);
    const newIds = newValue.map(Number).sort((a, b) => a - b);
    return JSON.stringify(oldIds) === JSON.stringify(newIds);
  }
  return JSON.stringify(stableValue(oldValue)) === JSON.stringify(stableValue(newValue));
}

export async function ensureProduct360HistoryTable() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS product_change_history (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      product_id integer NOT NULL,
      bigcommerce_id integer NOT NULL,
      variant_id bigint,
      variant_label text,
      field_key text NOT NULL,
      field_label text NOT NULL,
      old_value jsonb,
      new_value jsonb,
      user_id integer REFERENCES users(id) ON DELETE SET NULL,
      user_name text NOT NULL DEFAULT 'Unknown user',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS product_change_history_product_date_idx
      ON product_change_history (product_id, created_at DESC, id DESC);
  `));
}

export async function recordProduct360History(entries: Product360HistoryEntry[]) {
  if (entries.length === 0) return;

  const values = sql.join(entries.map((entry) => sql`(
    ${entry.productId},
    ${entry.bigcommerceId},
    ${entry.variantId ?? null},
    ${entry.variantLabel ?? null},
    ${entry.fieldKey},
    ${entry.fieldLabel},
    ${JSON.stringify(entry.oldValue ?? null)}::jsonb,
    ${JSON.stringify(entry.newValue ?? null)}::jsonb,
    ${entry.userId},
    ${entry.userName}
  )`), sql`, `);

  await db.execute(sql`
    INSERT INTO product_change_history (
      product_id, bigcommerce_id, variant_id, variant_label,
      field_key, field_label, old_value, new_value, user_id, user_name
    )
    VALUES ${values}
  `);
}
