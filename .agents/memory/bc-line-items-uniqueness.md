---
name: BC Order Line Items uniqueness
description: How duplicate prevention works for bc_order_line_items and why the query-time DISTINCT ON dedup was removed.
---

## Rule
`bc_order_line_items` has a functional UNIQUE index `uq_bc_order_line_items_business_key` on `(bigcommerce_order_id, bigcommerce_product_id, COALESCE(variant_id, 0))` created directly via raw SQL (Drizzle schema can't express functional unique indexes). All inserts use `ON CONFLICT DO NOTHING` against this index.

**Why:** The original code had no unique constraint — it deduped at query time with a `DISTINCT ON` subquery wrapping the entire table on every report query. This caused Sales Report generation to take minutes. 880 duplicate rows existed in the live DB when the constraint was added.

## Full sync behavior
- **Customers**: upserts via `ON CONFLICT DO UPDATE` on `bigcommerce_customer_id` (unique column in schema). Does NOT truncate — truncating would cascade-delete CRM notes and sales rep assignments.
- **Orders**: upserts via `ON CONFLICT DO UPDATE` on `bigcommerce_order_id` (unique column in schema). Does NOT truncate — same reason.
- **Line Items**: truncates first (`DELETE FROM bc_order_line_items`) then inserts. Safe to truncate because line items have no CRM-specific child data.

## Incremental sync behavior
- **Customers**: filters BigCommerce API with `date_modified:min=<crm_last_customer_sync>`, upserts.
- **Orders**: filters BigCommerce API with `min_date_modified=<crm_last_order_sync>`, upserts.
- **Line Items**: fetches orders where `order_date >= crm_last_line_items_sync`, inserts with `ON CONFLICT DO NOTHING`.

## Report queries
All three sales report functions (`getSalesReportSummary`, `getSalesReportDetails`, `getSalesReportStats`) query `bc_order_line_items` directly — no `DISTINCT ON` wrapper. The unique constraint guarantees clean data.

## How to apply
Never add a query-time dedup layer to report queries. If duplicates appear, fix the write path (upsert or unique constraint), not the read path.
