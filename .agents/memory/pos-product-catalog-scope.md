---
name: POS product catalog scope
description: Preserve the POS pinning purpose when broadening product data for Product 360
---

The `products` table was originally used to store POS-pinned products and has no active full-catalog BigCommerce sync. Treat `is_pinned` as POS curation state, not as catalog membership.

**Why:** Product 360 needs the complete catalog while POS staff still need their curated product set; conflating those purposes risks changing POS behavior during catalog backfills.

**How to apply:** Catalog upserts should include unpinned products and update only BigCommerce-owned fields, preserving `is_pinned` and `is_promotion`.
