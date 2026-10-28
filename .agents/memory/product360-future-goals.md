---
name: Product 360 future goals
description: Product 360's planned catalog change tracking, performance analytics, and BigCommerce draft workflow
---

Product 360 is intended to monitor product changes (including title, cost, price, and variants) with actor attribution, analyze sales performance, and create draft product listings in BigCommerce.

For product creation, variant SKUs use a manually entered base SKU plus a user-entered shorthand for each variant, formatted as `BASE-SHORTNAME` (for example, `SH50D-ST`).

New variant prices and costs inherit the product-level values until the user explicitly overrides either field.

Variant labels are option-value labels in BigCommerce, while sales units and velocity are derived analytics rather than editable catalog fields. Only edit per-variant stock when BigCommerce tracks inventory by variant; a combined multi-option label must not be written into one option value.

**Why:** These goals require more than a current-state catalog mirror: durable change history and a deliberate draft lifecycle are separate concerns.

**How to apply:** Preserve the POS pinning purpose of `products`; design catalog sync, audit history, sales inputs, and draft creation as distinct responsibilities. Keep variant shorthand editable so staff can use their established SKU abbreviations, distinguish inherited values from explicit variant overrides, and keep catalog edits separate from derived sales metrics.
