---
name: Dropshipping phase boundaries
description: Durable separation between vendor catalog ingestion and downstream commerce/inventory actions.
---

Vendor catalog sync and CSV ingestion remain local to SalesCore and never write to BigCommerce. BigCommerce writes are allowed only through explicit user actions: selected draft creation with a chosen existing category (drafts stay hidden, disabled, and photo-free), or a separate manual sync for already-mapped products. Product photos are added only by the manual Image Sync after mapping; it appends watermarked Kole photos while keeping all current BigCommerce photos. Details sync may update extended cost, non-empty descriptions, and provided inventory only for products already using product-level tracking. It must not change tracking mode or selling price.

Brand-based SKU matching is a separate, manual, repeatable action: it scans all BigCommerce products under the selected brand and creates or remaps local catalog links only. It must not write to BigCommerce products.

**Why:** The user authorized two distinct manual BigCommerce actions while keeping feed ingestion and mapping local. After raw and watermarked photos appeared as duplicate sets, the user chose photo-free draft creation followed by explicit Image Sync, while preserving photos already on existing products. Inventory tracking settings, selling prices, product visibility, vendor orders, and SkuVault inventory remain outside the details-sync authorization.

**How to apply:** Keep vendor-specific API behavior behind an adapter. Treat queue and mapping status as local state; never run the draft or details write automatically during feed/CSV import or SKU mapping. Draft creation omits source image URLs; run explicit Image Sync only after a product is mapped. Details sync targets existing mappings, does not remove photos or change inventory-tracking mode, and skips stock when feed inventory is absent or BigCommerce is not product-tracked. Do not mutate vendor orders or SkuVault inventory without separate authorization. Resolve a manually entered brand against fresh BigCommerce brand data before mapping.