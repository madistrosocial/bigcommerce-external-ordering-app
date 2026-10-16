---
name: Product 360 category mix
description: Product 360 category-sales attribution and category-catalog persistence decision
---

Product 360 category sales should use the existing product-to-category IDs and the BigCommerce category hierarchy rather than introducing a second product-category system. The four main categories are Disposables, E-Liquid, Hardware, and Smoke Shop. Products assigned to multiple main categories use the established primary-category order so the totals reconcile; unmatched sales remain visible in an Other / Uncategorized bucket. The chart supports both units sold and revenue.

**Why:** Product Master already stores BigCommerce category IDs, while category names and hierarchy are available through the existing cached BigCommerce catalog. These IDs are stored as numeric JSONB array elements; PostgreSQL's `?|` operator silently misses them when compared to text IDs.

**How to apply:** Preserve the same category names, attribution rule, and reconciled totals when extending Product 360 category reporting or adding category filters. Use `jsonb_array_elements_text` for SQL matching and exclude higher-priority categories in selected-category filters so filtered totals match the chart.

During category drill-down, attribute each product's sales to one immediate child branch only: use the first assigned category in the stored product category list that belongs under the selected parent. Products assigned directly to the selected parent remain in a non-clickable direct/other bucket when child categories exist.

**Why:** Products may be assigned to multiple nested categories. Counting their sales in every branch would inflate category totals and make them disagree with the selected parent and the other dashboard cards.

**How to apply:** Keep the same first-matching-branch rule at each depth and use the selected category's descendant IDs for the rest of the dashboard filters.