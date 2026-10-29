---
name: Product 360 future goals
description: Product 360's planned catalog change tracking, performance analytics, and BigCommerce draft workflow
---

Product 360 tracks product and variant edits as append-only, per-field history with actor attribution; routine catalog syncs are not staff edits and must stay out of that history. The module also analyzes sales performance and supports draft product listings in BigCommerce.

For product creation, variant SKUs use a manually entered base SKU plus a user-entered shorthand for each variant, formatted as `BASE-SHORTNAME` (for example, `SH50D-ST`).

New variant prices and costs inherit the product-level values until the user explicitly overrides either field.

Variant labels are option-value labels in BigCommerce, while sales units and velocity are derived analytics rather than editable catalog fields. Only edit per-variant stock when BigCommerce tracks inventory by variant; a combined multi-option label must not be written into one option value.

**Why:** Staff need to see who changed each product field and when, without catalog refreshes being mistaken for edits.

**How to apply:** When adding editable Product 360 fields or routes, include successful product and variant writes in the field-level audit trail, but keep catalog sync writes out. Preserve the POS pinning purpose of `products` and the separation between catalog sync, audit history, sales inputs, and draft creation. Keep variant shorthand editable so staff can use their established SKU abbreviations, distinguish inherited values from explicit variant overrides, and keep catalog edits separate from derived sales metrics.
