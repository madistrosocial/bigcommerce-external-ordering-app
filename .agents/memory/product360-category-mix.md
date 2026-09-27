---
name: Product 360 category mix
description: Product 360 category-sales attribution and category-catalog persistence decision
---

Product 360 category sales should use the existing product-to-category IDs and the BigCommerce category hierarchy rather than introducing a second product-category system. The four main categories are Disposables, E-Liquid, Hardware, and Smoke Shop. Products assigned to multiple main categories use the established primary-category order so the totals reconcile; unmatched sales remain visible in an Other / Uncategorized bucket. The chart supports both units sold and revenue.

**Why:** Product Master already stores BigCommerce category IDs, while category names and hierarchy are available through the existing cached BigCommerce catalog. A new category table would duplicate existing relationships and add synchronization work without improving the initial report.

**How to apply:** Preserve the same category names, attribution rule, and reconciled totals when extending Product 360 category reporting or adding category filters.