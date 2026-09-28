---
name: Dropship brand dashboard counts
description: Source, date scope, and freshness limits for BigCommerce brand order metrics.
---

**Rule:** Resolve product IDs for each BigCommerce brand from the BigCommerce catalog, then count distinct order IDs in synced `bc_order_line_items`. Use the line-item `order_date` for date buckets in the company timezone; do not rely on the local POS product table for brand membership.

**Why:** The local `products` table is a curated POS catalog, and ordinary product imports may not populate `brand_id`. Joining order history to it silently drops valid sales even when line-item sync is healthy. These metrics are BigCommerce order analytics, not vendor-reported fulfillment status.

**How to apply:** Keep BigCommerce product-ID lookup cached and fail visibly when it fails instead of reporting false zeroes. Pass product ID lists to raw Drizzle SQL as JSON and expand with `jsonb_array_elements_text`; directly interpolating JavaScript arrays can become a record expression and fail an `int[]` cast. Use the company timezone for day/month boundaries and matching Sales History date filters; keep the sync-freshness caveat visible.