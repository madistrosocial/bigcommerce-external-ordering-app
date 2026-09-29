---
name: Kole Product Sync safety contract
description: User-approved boundaries for syncing mapped Kole products to BigCommerce.
---

# Kole Product Sync safety contract

Keep mapped-product maintenance separate from vendor catalog ingestion. Details sync only applies selected groups: extended cost, description, inventory quantity, and product name/brand/UPC.

- Never change selling price or `inventory_tracking`.
- Update quantity only when Kole explicitly supplied a valid count and the BigCommerce product already uses product-level tracking.
- Set `brand_id` only when exactly one BigCommerce brand matches the Kole name; unknown or ambiguous names must leave the current brand unchanged.
- Image sync preserves existing BigCommerce photos and appends processed Kole copies. Pad the source photo on white to 1200×1200, then apply the saved transparent full-canvas PNG overlay.
- Keep per-product image-source history so a repeat run does not append the same watermarked copy again.

**Why:** The user confirmed the existing mapped sync was working and asked to move and extend it, not change its safety behavior. Selling price, tracking mode, and existing photos are sensitive catalog data.

**How to apply:** Preserve these boundaries when changing the Product Sync page, API, or BigCommerce update logic; test against mocked BigCommerce calls before changing them.