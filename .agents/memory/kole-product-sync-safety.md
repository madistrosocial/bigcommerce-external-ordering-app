---
name: Kole Product Sync safety contract
description: User-approved boundaries for syncing mapped Kole products to BigCommerce.
---

# Kole Product Sync safety contract

Keep mapped-product maintenance separate from vendor catalog ingestion. Details sync only applies selected groups: extended cost, description, inventory quantity, and product name/brand/UPC.

- Never change selling price or `inventory_tracking`.
- Update quantity only when Kole explicitly supplied a valid count and the BigCommerce product already uses product-level tracking.
- Set `brand_id` only when exactly one BigCommerce brand matches the Kole name; unknown or ambiguous names must leave the current brand unchanged.
- Create BigCommerce drafts without source image URLs; add photos only through explicit Image Sync after mapping.
- Image sync preserves existing BigCommerce photos and appends processed Kole copies. Pad the source photo on white to 1200×1200, then apply the saved transparent full-canvas PNG overlay.
- Keep per-product image-source history so normal runs do not append the same watermarked copy again. A forced re-upload must be explicit, bypass history only for that run, and warn that appending can create duplicates.
- Clear an old BigCommerce mapping only after a direct product lookup returns 404; absence from a brand-filtered scan or another request failure does not prove deletion.

**Why:** The user confirmed the existing mapped sync was working and asked to move and extend it, not change its safety behavior. The initial raw-image upload followed by watermarked sync produced duplicate sets, so new drafts must remain photo-free until Image Sync. A brand scan can omit live products assigned elsewhere, and transient API failures must not erase their mappings. Selling price, tracking mode, and existing photos are sensitive catalog data.

**How to apply:** Preserve these boundaries when changing the Product Sync page, API, or BigCommerce update logic; treat only a confirmed 404 as deleted, keep the upload ledger after forced runs, and never delete BigCommerce photos.