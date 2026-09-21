---
name: Sales Report search performance
description: Performance constraints and indexing rules for Product/SKU lookup in the Sales Report.
---

Sales Report Product/SKU lookup must debounce input and avoid querying the full order-line mirror for every character. Product-name searches should use the local products catalog first; SKU searches use a lower(sku) text_pattern_ops index with prefix matching.

**Why:** The order-line mirror can contain hundreds of thousands of historical rows, so wildcard scans on every keystroke make the filter feel unresponsive.

**How to apply:** Keep the client minimum query length at two characters with a short debounce and cached results. Preserve the indexed prefix SKU path when changing the endpoint or search UI.