---
name: Kole feed draft pricing
description: Pricing and stock-safety rules when turning vendor-feed rows into BigCommerce drafts.
---

For Kole CSV imports, map supplier unit cost to BigCommerce cost price only. The feed has no retail-price rule, so require a user-entered retail price for every selected draft; never infer retail price from supplier cost. Create products hidden and disabled, and skip an existing SKU rather than overwriting it. Blank vendor inventory means unknown, not zero; use no inventory tracking for those BigCommerce drafts. Keep live-feed sync manual; an explicit user-uploaded CSV is an allowed manual alternative, but never silently fall back to a saved snapshot.

**Why:** The CSV provides `item_piece_price` but not the store's retail margin, and many rows omit inventory. The feed updates daily, so the user prefers explicit manual syncs; a saved snapshot may have stale stock. Defaulting prices or stock would create incorrect customer pricing or falsely advertise inventory.

**How to apply:** Keep feed sync local to the Vendor Catalog and run it only on a user action. If the live feed is unavailable, report the error; let the user upload a CSV explicitly if they want to proceed. Only the explicit selected-item draft action may write to BigCommerce, with manual per-item prices, hidden/disabled visibility, and duplicate-SKU protection.