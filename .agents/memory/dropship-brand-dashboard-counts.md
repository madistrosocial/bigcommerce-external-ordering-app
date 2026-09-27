---
name: Dropship brand dashboard counts
description: Source, date scope, and freshness limits for BigCommerce brand order metrics.
---

Count distinct BigCommerce order IDs from synced order line items joined to the current local product catalog's brand assignments. These are BigCommerce order analytics, not vendor-reported fulfillment status or proof that an order was placed through Duoplane or another vendor API.

**Why:** The app does not ingest a unified vendor-order feed. BigCommerce orders and locally synced product-brand mappings are the available shared source, and line-item sync can be stale or incomplete.

**How to apply:** Use the company timezone for day/month boundaries and matching Sales History date filters. Keep the sync-freshness caveat visible, and do not infer vendor processing state from these counts.