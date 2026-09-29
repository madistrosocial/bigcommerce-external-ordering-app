---
name: Kole feed draft pricing
description: Pricing and stock-safety rules when turning vendor-feed rows into BigCommerce drafts.
---

Keep vendor-feed sync local to the Vendor Catalog. Only an explicit selected-item action may create BigCommerce products, and those drafts stay hidden and disabled; skip an existing SKU rather than overwriting it. Require a valid existing BigCommerce category for each new draft. Until the user supplies a Kole-to-store category mapping, allow a user to choose one category for a batch and override it per product. Suggest retail price as `roundToCents(unit cost × positive Kole minimum quantity × 1.20)`; keep it editable and leave it blank when cost or minimum quantity is missing or nonpositive. Use MOQ for the suggested pack price only; do not convert inventory counts or BigCommerce purchase-quantity fields without explicit confirmation. Blank vendor inventory means unknown, not zero. Live-feed sync remains manual; a user-uploaded CSV is an explicit alternative, never a silent fallback.

**Why:** The user specified a 20% markup on supplier cost multiplied by Kole MOQ and the failed BigCommerce request showed that a category is mandatory. The store's category mapping is not yet available, so category selection must be explicit rather than guessed. Inventory and pack-count semantics were not specified.

**How to apply:** Keep feed sync local to the Vendor Catalog and run it only on a user action. If the live feed is unavailable, report the error; let the user upload a CSV explicitly if they want to proceed. For selected drafts, show the formula price as an editable suggestion, require a category from the live BigCommerce category list, and preserve hidden/disabled visibility and duplicate-SKU protection.