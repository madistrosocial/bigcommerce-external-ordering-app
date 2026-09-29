---
name: Kole feed draft pricing
description: Pricing and stock-safety rules when turning vendor-feed rows into BigCommerce drafts.
---

For Kole CSV imports, map supplier unit cost to BigCommerce cost price only. The feed has no retail-price rule, so require a user-entered retail price for every selected draft; never infer retail price from supplier cost. Create products hidden and disabled, and skip an existing SKU rather than overwriting it. Blank vendor inventory means unknown, not zero; use no inventory tracking for those BigCommerce drafts.

**Why:** The CSV provides `item_piece_price` but not the store's retail margin, and many rows omit inventory. Defaulting these values would create incorrect customer pricing or falsely advertise stock.

**How to apply:** Keep feed sync local to the Vendor Catalog. Only the explicit selected-item draft action may write to BigCommerce, with manual per-item prices, hidden/disabled visibility, and duplicate-SKU protection.