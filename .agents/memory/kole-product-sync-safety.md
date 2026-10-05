---
name: Kole Product Sync safety contract
description: User-approved boundaries for syncing mapped Kole products to BigCommerce.
---

# Kole Product Sync safety contract

Keep mapped-product maintenance separate from vendor catalog ingestion. Details sync only applies selected groups: extended cost, description, inventory quantity, and product name/brand/UPC.

- Never change selling price or `inventory_tracking`.
- A direct product-SKU mapping may update quantity only when Kole supplied a valid count and BigCommerce uses product-level tracking. A variant-SKU mapping may update only that variant's quantity, only when its parent uses variant-level tracking and a fresh lookup still matches the mapped parent and SKU.
- Variant mappings retain both the parent product ID and exact variant ID. Product details and images target the parent; serialize sibling image work, but keep photo history scoped to each Kole listing so one SKU's images do not suppress another's.
- When multiple selected variant SKUs share a parent, allow shared parent fields only when their supplied values agree; leave conflicting fields unchanged while still syncing each valid variant's inventory.
- Treat an empty-option BigCommerce base variant as the parent product, not as a separately stocked variant, to avoid duplicate SKU matches for simple products.
- Set `brand_id` only when exactly one BigCommerce brand matches the Kole name; unknown or ambiguous names must leave the current brand unchanged.
- Create BigCommerce drafts without source image URLs; add photos only through explicit Image Sync after mapping.
- Image sync preserves existing BigCommerce photos and appends processed Kole copies. Pad the source photo on white to 1200×1200, then apply the saved transparent full-canvas PNG overlay.
- Keep image-source history per Kole listing, not per shared BigCommerce parent, so sibling SKUs can each contribute their photos while repeat runs remain idempotent. Reconcile old parent-wide history conservatively.
- A forced re-upload must be explicit, bypass history only for that run, and warn that appending can create duplicates.
- Clear an old BigCommerce mapping only after a direct product lookup returns 404; absence from a brand-filtered scan or another request failure does not prove deletion.

**Why:** Parent details and the photo destination are shared across sibling variants, but inventory and photo provenance are SKU-specific. A parent-wide photo ledger can suppress a sibling's distinct image upload. Conflicting values from sibling Kole rows must not become last-write-wins parent data, and BigCommerce's base variant represents a simple product rather than a distinct stock target. The user confirmed the existing mapped sync should retain its safety behavior: drafts stay photo-free until Image Sync, a brand scan or transient failure must not erase mappings, and selling price, tracking mode, and existing photos are sensitive catalog data.

**How to apply:** Preserve these boundaries when changing the Product Sync page, API, or BigCommerce update logic; verify a variant's parent and SKU immediately before its inventory write, serialize sibling image work by parent, keep upload history per Kole listing, treat only a confirmed 404 as deleted, keep the upload ledger after forced runs, and never delete BigCommerce photos.