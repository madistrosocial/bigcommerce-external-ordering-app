---
name: Dropshipping phase boundaries
description: Durable separation between vendor catalog ingestion and downstream commerce/inventory actions.
---

Phase 1 vendor work is read-only ingestion into SalesCore: it may store vendor products, mapping/import status, and sync history, but must not create or modify BigCommerce products, publish products, create vendor orders, or change SkuVault inventory.

**Why:** Vendor catalog data needs review for pack/tier semantics, pricing, mapping, and closeout behavior before downstream side effects are safe.

**How to apply:** Keep vendor-specific API behavior behind an adapter. Treat import queue and mapping status as local state until a later phase explicitly authorizes BigCommerce, vendor-order, or inventory mutations.