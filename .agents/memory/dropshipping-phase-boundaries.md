---
name: Dropshipping phase boundaries
description: Durable separation between vendor catalog ingestion and downstream commerce/inventory actions.
---

Vendor catalog sync and CSV ingestion remain local to SalesCore and never write to BigCommerce. BigCommerce writes are allowed only through explicit user actions: selected draft creation with a chosen existing category (drafts stay hidden and disabled), or a separate manual sync for already-mapped products. That details sync may update extended cost, non-empty descriptions, provided inventory only for products already using product-level tracking, and append missing Kole photos while keeping existing photos. It must not change tracking mode or selling price.

Brand-based SKU matching is a separate, manual, repeatable action: it scans all BigCommerce products under the selected brand and creates or remaps local catalog links only. It must not write to BigCommerce products.

**Why:** The user authorized two distinct manual BigCommerce actions while keeping feed ingestion and mapping local. Inventory tracking settings, selling prices, product visibility, vendor orders, and SkuVault inventory remain outside the details-sync authorization.

**How to apply:** Keep vendor-specific API behavior behind an adapter. Treat queue and mapping status as local state; never run the draft or details write automatically during feed/CSV import or SKU mapping. The detail action targets only existing mappings, does not remove photos or change inventory-tracking mode, and skips stock when feed inventory is absent or BigCommerce is not product-tracked. Do not mutate vendor orders or SkuVault inventory without separate authorization. Resolve a manually entered brand against fresh BigCommerce brand data before mapping.