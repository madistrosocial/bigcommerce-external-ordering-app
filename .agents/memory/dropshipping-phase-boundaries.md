---
name: Dropshipping phase boundaries
description: Durable separation between vendor catalog ingestion and downstream commerce/inventory actions.
---

Vendor catalog sync and CSV ingestion remain local to SalesCore. BigCommerce writes are allowed only through an explicit user-selected draft action with a chosen existing category; resulting products stay hidden and disabled. No feed sync may create products, publish products, create vendor orders, or change SkuVault inventory.

Brand-based SKU matching is a separate, manual, repeatable action: it scans all BigCommerce products under the selected brand and creates or remaps local catalog links only. It must not write to BigCommerce products.

**Why:** The user explicitly requested selected BigCommerce test drafts after reviewing vendor data, but automatic ingestion or publication remains unsafe. The store's source-to-target category mapping and pack inventory semantics still require user direction.

**How to apply:** Keep vendor-specific API behavior behind an adapter. Treat queue and mapping status as local state; only the explicit draft action may write hidden, disabled BigCommerce products, and do not mutate vendor orders or inventory systems without separate authorization. Resolve a manually entered brand against fresh BigCommerce brand data before mapping.